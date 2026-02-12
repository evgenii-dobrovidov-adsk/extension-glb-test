import { WebIO } from "@gltf-transform/core";
import type { GeometryData } from "./types";

/**
 * Apply a translation and scale to a GLB using glTF-Transform.
 * Creates a wrapper node to apply the transformation.
 * Note: glTF uses Y-up, Forma uses Z-up, so we swap Y and Z.
 */
export async function transformGlb(
  glbBuffer: ArrayBuffer,
  x: number,
  y: number,
  z: number,
  scale: number = 1,
): Promise<ArrayBuffer> {
  const io = new WebIO();
  const doc = await io.readBinary(new Uint8Array(glbBuffer));

  for (const scene of doc.getRoot().listScenes()) {
    const children = scene.listChildren();
    if (children.length === 0) continue;

    const wrapper = doc.createNode("transform_wrapper");
    wrapper.setTranslation([x, z, -y]);
    wrapper.setScale([scale, scale, scale]);

    for (const child of children) {
      scene.removeChild(child);
      wrapper.addChild(child);
    }

    scene.addChild(wrapper);
  }

  const result = await io.writeBinary(doc);
  return result.buffer;
}

/**
 * Extract GeometryData from a GLB file using glTF-Transform.
 * Converts to triangle soup (no index reuse) for compatibility.
 */
export async function glbToGeometryData(glbBuffer: ArrayBuffer): Promise<GeometryData> {
  const io = new WebIO();
  const doc = await io.readBinary(new Uint8Array(glbBuffer));

  const allPositions: number[] = [];
  const allNormals: number[] = [];

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positionAccessor = primitive.getAttribute("POSITION");
      const normalAccessor = primitive.getAttribute("NORMAL");
      const indicesAccessor = primitive.getIndices();

      if (!positionAccessor) continue;

      const positions = positionAccessor.getArray();
      const normals = normalAccessor?.getArray();
      const indices = indicesAccessor?.getArray();

      if (!positions) continue;

      if (indices) {
        for (let i = 0; i < indices.length; i++) {
          const idx = indices[i]!;
          allPositions.push(
            positions[idx * 3]!,
            positions[idx * 3 + 1]!,
            positions[idx * 3 + 2]!,
          );
          if (normals) {
            allNormals.push(
              normals[idx * 3]!,
              normals[idx * 3 + 1]!,
              normals[idx * 3 + 2]!,
            );
          }
        }
      } else {
        for (let i = 0; i < positions.length; i++) {
          allPositions.push(positions[i]!);
        }
        if (normals) {
          for (let i = 0; i < normals.length; i++) {
            allNormals.push(normals[i]!);
          }
        }
      }
    }
  }

  const geometryData: GeometryData = {
    position: new Float32Array(allPositions),
  };

  if (allNormals.length > 0) {
    geometryData.normal = new Float32Array(allNormals);
  }

  return geometryData;
}
