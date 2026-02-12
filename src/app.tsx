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
 * Apply a translation and scale to a GLB using glTF-Transform.
 * Creates a wrapper node to apply the transformation.
 * Note: glTF uses Y-up, Forma uses Z-up, so we swap Y and Z.
 */
async function transformGlb(
  glbBuffer: ArrayBuffer,
  x: number,
  y: number,
  z: number,
  scale: number = 1,
): Promise<ArrayBuffer> {
  const io = new WebIO();
  const doc = await io.readBinary(new Uint8Array(glbBuffer));

  // For each scene, create a wrapper node and reparent all children under it
  for (const scene of doc.getRoot().listScenes()) {
    const children = scene.listChildren();
    if (children.length === 0) continue;

    // Create a wrapper node with our transform
    // Swap Y and Z for coordinate system conversion (Forma Z-up → glTF Y-up)
    const wrapper = doc.createNode("transform_wrapper");
    wrapper.setTranslation([x, z, -y]);
    wrapper.setScale([scale, scale, scale]);

    // Reparent all existing root nodes under the wrapper
    for (const child of children) {
      scene.removeChild(child);
      wrapper.addChild(child);
    }

    // Add wrapper to scene
    scene.addChild(wrapper);
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
    setStatus({ type: "info", message: "Click in the scene to place the element..." });

    try {
      const point = await Forma.designTool.getPoint();
      if (!point) {
        setStatus({ type: "info", message: "Placement cancelled." });
        return;
      }

      const { x, y } = point;
      const z = await Forma.terrain.getElevationAt({ x, y });
      const transform = createTranslationMatrix(x, y, z);

      setStatus({ type: "info", message: "Uploading GLB to Forma..." });
      const arrayBuffer = await selectedFile.arrayBuffer();
      const integrate = Forma.integrateElements;
      const upload = await integrate.uploadFile({ data: arrayBuffer });
      if (!upload.blobId) {
        throw new Error("Upload did not return blobId.");
      }

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

      await Forma.experimental.render.element.add({
        elements: [
          {
            urn: geometryUrn,
            transform,
          },
        ],
      });

      setStatus({
        type: "success",
        message: `Element added at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
      });
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

  const handleRenderAtPoint = async () => {
    if (!selectedFile) {
      setStatus({ type: "error", message: "Select a .glb file first." });
      return;
    }

    if (!isGlbFile(selectedFile)) {
      setStatus({ type: "error", message: "Selected file must be a .glb." });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Click in the scene to place the GLB..." });

    try {
      const point = await Forma.designTool.getPoint();
      if (!point) {
        setStatus({ type: "info", message: "Placement cancelled." });
        return;
      }

      const { x, y } = point;
      // Get terrain elevation at the picked point
      const z = await Forma.terrain.getElevationAt({ x, y });

      setStatus({ type: "info", message: "Transforming GLB..." });
      const arrayBuffer = await selectedFile.arrayBuffer();
      const transformedGlb = await transformGlb(arrayBuffer, x, y, z, 10);

      setStatus({ type: "info", message: "Rendering GLB..." });
      const { id } = await Forma.render.glb.add({ glb: transformedGlb });
      setRenderGlbId(id);

      setStatus({
        type: "success",
        message: `GLB rendered at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
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

  const handleCleanup = async () => {
    setIsBusy(true);
    setStatus({ type: "info", message: "Cleaning up all rendered GLBs..." });

    try {
      await Forma.render.glb.cleanup();
      setStatus({ type: "success", message: "All rendered GLBs removed." });
      setRenderGlbId(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during cleanup.";
      setStatus({ type: "error", message });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div class="app">
      <h1>GLB Placer</h1>

      <div class="panel">
        <label class="file-label">
          Select GLB file
          <input type="file" accept=".glb" onChange={onFileChange} />
        </label>
        {selectedFile && (
          <div class="file-info">
            <strong>{selectedFile.name}</strong> ({formatSize(selectedFile.size)})
          </div>
        )}
        <p class="footnote">Max file size: {MAX_FILE_SIZE_MB} MB</p>
      </div>

      {status && <div class={`status ${status.type}`}>{status.message}</div>}

      <h2>Add Element to Proposal</h2>
      <p class="subtitle">
        Creates a permanent element in the proposal at a selected point.
      </p>
      <div class="panel">
        <button
          class="primary"
          onClick={handleUpload}
          disabled={isBusy || !selectedFile}
        >
          {isBusy ? "Working..." : "Pick point & add"}
        </button>
        {elementPath && (
          <div class="path-row">
            <span class="path-label">Element Path</span>
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

      <h2>Render Temporarily in Scene</h2>
      <p class="subtitle">
        Renders GLB temporarily (not saved to proposal).
      </p>
      <div class="panel">
        <div class="button-row">
          <button
            class="primary"
            onClick={handleRenderAtPoint}
            disabled={isBusy || !selectedFile}
          >
            {isBusy ? "Working..." : "Pick point & render"}
          </button>
          <button
            class="secondary"
            onClick={handleCleanup}
            disabled={isBusy}
          >
            Cleanup all
          </button>
        </div>
        {renderGlbId && (
          <div class="path-row">
            <span class="path-label">Render ID</span>
            <code class="path-value">{renderGlbId}</code>
          </div>
        )}
      </div>
    </div>
  );
}
