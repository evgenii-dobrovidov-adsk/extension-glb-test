import { useState } from "preact/hooks";
import { Forma } from "forma-embedded-view-sdk/auto";
import { WebIO } from "@gltf-transform/core";
import "./app.css";

type Status = {
  type: "info" | "success" | "error";
  message: string;
};

type TransformMatrix = [
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

const MAX_FILE_SIZE_MB = 200;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const formatSize = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const isGlbFile = (file: File) => file.name.toLowerCase().endsWith(".glb");

const createTranslationMatrix = (
  x: number,
  y: number,
  z: number,
): TransformMatrix =>
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] as TransformMatrix;

/**
 * Apply a translation to a GLB using glTF-Transform.
 * Modifies the root scene nodes to include the translation.
 */
async function translateGlb(
  glbBuffer: ArrayBuffer,
  x: number,
  y: number,
  z: number,
): Promise<ArrayBuffer> {
  const io = new WebIO();
  const doc = await io.readBinary(new Uint8Array(glbBuffer));

  // Apply translation to all root nodes in all scenes
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      const currentTranslation = node.getTranslation();
      node.setTranslation([
        currentTranslation[0] + x,
        currentTranslation[1] + y,
        currentTranslation[2] + z,
      ]);
    }
  }

  const result = await io.writeBinary(doc);
  return result.buffer;
}

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [elementPath, setElementPath] = useState<string | null>(null);
  const [renderGlbId, setRenderGlbId] = useState<string | null>(null);

  const onFileChange = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;
    setSelectedFile(file);

    if (!file) {
      setStatus(null);
      return;
    }

    if (!isGlbFile(file)) {
      setStatus({ type: "error", message: "Please select a .glb file." });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus({
        type: "error",
        message: `File too large. Max size is ${MAX_FILE_SIZE_MB} MB.`,
      });
      return;
    }

    setStatus({
      type: "info",
      message: `Selected ${file.name} (${formatSize(file.size)})`,
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus({ type: "error", message: "Select a .glb file first." });
      return;
    }

    if (!isGlbFile(selectedFile)) {
      setStatus({ type: "error", message: "Selected file must be a .glb." });
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setStatus({
        type: "error",
        message: `File too large. Max size is ${MAX_FILE_SIZE_MB} MB.`,
      });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Uploading GLB to Forma..." });

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const integrate = Forma.integrateElements;
      const upload = await integrate.uploadFile({ data: arrayBuffer });
      if (!upload.blobId) {
        throw new Error("Upload did not return blobId.");
      }

      setStatus({ type: "info", message: "Computing terrain center..." });
      const bbox = await Forma.terrain.getBbox();
      const centerX = (bbox.min.x + bbox.max.x) / 2;
      const centerY = (bbox.min.y + bbox.max.y) / 2;
      const centerZ =
        typeof Forma.terrain.getElevationAt === "function"
          ? await Forma.terrain.getElevationAt({ x: centerX, y: centerY })
          : (bbox.min.z ?? 0);
      const transform = createTranslationMatrix(centerX, centerY, centerZ);

      setStatus({ type: "info", message: "Creating element in the scene..." });
      const { urn: geometryUrn } = await integrate.createElementV2({
        representations: {
          volumeMesh: {
            type: "linked",
            blobId: upload.blobId,
          },
        },
      });

      const { path } = await Forma.proposal.addElement({
        urn: geometryUrn,
        transform,
      });
      setElementPath(path);

      // Optionally add the GLB to the library so that it can be reused across proposals
      // await Forma.library.createItem({
      //   authcontext: Forma.getProjectId(),
      //   data: {
      //     name: "My element",
      //     urn: geometryUrn,
      //     status: "success",
      //   },
      // });

      await Forma.experimental.render.element.add({
        elements: [
          {
            urn: geometryUrn,
            transform,
          },
        ],
      });

      setStatus({ type: "success", message: "GLB placed at terrain center." });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during upload.";
      setStatus({ type: "error", message });
      setElementPath(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!elementPath) {
      setStatus({ type: "error", message: "No element path to delete yet." });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Removing element from proposal..." });

    try {
      await Forma.proposal.removeElement({ path: elementPath });
      setStatus({ type: "success", message: "Element removed from proposal." });
      setElementPath(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during delete.";
      setStatus({ type: "error", message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenderAtEdge = async () => {
    if (!selectedFile) {
      setStatus({ type: "error", message: "Select a .glb file first." });
      return;
    }

    if (!isGlbFile(selectedFile)) {
      setStatus({ type: "error", message: "Selected file must be a .glb." });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Computing terrain edge position..." });

    try {
      const bbox = await Forma.terrain.getBbox();
      // Place at max X edge (east side of terrain), centered on Y
      const edgeX = bbox.max.x;
      const centerY = (bbox.min.y + bbox.max.y) / 2;
      // Get elevation at the edge position, then add some height above terrain
      const terrainZ = await Forma.terrain.getElevationAt({ x: edgeX, y: centerY });
      const heightAboveTerrain = 10; // 10 meters above terrain
      const targetZ = terrainZ + heightAboveTerrain;

      setStatus({ type: "info", message: "Transforming GLB..." });
      const arrayBuffer = await selectedFile.arrayBuffer();
      const translatedGlb = await translateGlb(arrayBuffer, edgeX, centerY, targetZ);

      setStatus({ type: "info", message: "Rendering GLB at terrain edge..." });
      const { id } = await Forma.render.glb.add({ glb: translatedGlb });
      setRenderGlbId(id);

      setStatus({
        type: "success",
        message: `GLB rendered at terrain edge (x=${edgeX.toFixed(1)}, z=${targetZ.toFixed(1)}m)`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during render.";
      setStatus({ type: "error", message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveRendered = async () => {
    if (!renderGlbId) {
      setStatus({ type: "error", message: "No rendered GLB to remove." });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Removing rendered GLB..." });

    try {
      await Forma.render.glb.remove({ id: renderGlbId });
      setStatus({ type: "success", message: "Rendered GLB removed." });
      setRenderGlbId(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during removal.";
      setStatus({ type: "error", message });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div class="app">
      <h1>GLB uploader</h1>
      <p class="subtitle">
        Select a <code>.glb</code> file and place it at the center of the
        terrain.
      </p>
      <div class="panel">
        <label class="file-label">
          GLB file
          <input type="file" accept=".glb" onChange={onFileChange} />
        </label>
        <button
          class="primary"
          onClick={handleUpload}
          disabled={isBusy || !selectedFile}
        >
          {isBusy ? "Working..." : "Upload & place"}
        </button>
        {elementPath && (
          <div class="path-row">
            <span class="path-label">Path</span>
            <code class="path-value">{elementPath}</code>
          </div>
        )}
        <button
          class="secondary"
          onClick={handleDelete}
          disabled={isBusy || !elementPath}
        >
          Delete element
        </button>
      </div>

      <h2>Render at Terrain Edge</h2>
      <p class="subtitle">
        Use <code>RenderGlbApi.add()</code> to place GLB at terrain edge with
        elevation.
      </p>
      <div class="panel">
        <button
          class="primary"
          onClick={handleRenderAtEdge}
          disabled={isBusy || !selectedFile}
        >
          {isBusy ? "Working..." : "Render at edge"}
        </button>
        {renderGlbId && (
          <div class="path-row">
            <span class="path-label">Render ID</span>
            <code class="path-value">{renderGlbId}</code>
          </div>
        )}
        <button
          class="secondary"
          onClick={handleRemoveRendered}
          disabled={isBusy || !renderGlbId}
        >
          Remove rendered
        </button>
        {status && <div class={`status ${status.type}`}>{status.message}</div>}
      </div>
      <p class="footnote">Max file size: {MAX_FILE_SIZE_MB} MB</p>
    </div>
  );
}
