import { useState } from "preact/hooks";
import { Forma } from "forma-embedded-view-sdk/auto";
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

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [elementPath, setElementPath] = useState<string | null>(null);

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
        {status && <div class={`status ${status.type}`}>{status.message}</div>}
      </div>
      <p class="footnote">Max file size: {MAX_FILE_SIZE_MB} MB</p>
    </div>
  );
}
