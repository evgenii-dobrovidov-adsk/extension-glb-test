import { useState, useRef } from "preact/hooks";
import { Forma } from "forma-embedded-view-sdk/auto";
import type { Status } from "./types";
import { isGlbFile, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, createTransformMatrix } from "./types";

type Props = {
  selectedFile: File | null;
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
  setStatus: (status: Status | null) => void;
};

type CachedUpload = {
  fileName: string;
  fileSize: number;
  geometryUrn: string;
};

export function AddElementToProposal({ selectedFile, isBusy, setIsBusy, setStatus }: Props) {
  const [elementPath, setElementPath] = useState<string | null>(null);
  const cachedUpload = useRef<CachedUpload | null>(null);

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
      const transform = createTransformMatrix(x, y, z, 10);

      let geometryUrn: string;

      // Check if we have a cached upload for this file
      const isSameFile =
        cachedUpload.current &&
        cachedUpload.current.fileName === selectedFile.name &&
        cachedUpload.current.fileSize === selectedFile.size;

      if (isSameFile) {
        setStatus({ type: "info", message: "Using cached GLB..." });
        geometryUrn = cachedUpload.current!.geometryUrn;
      } else {
        setStatus({ type: "info", message: "Uploading GLB to Forma..." });
        const arrayBuffer = await selectedFile.arrayBuffer();
        const integrate = Forma.integrateElements;
        const upload = await integrate.uploadFile({ data: arrayBuffer });
        if (!upload.blobId) {
          throw new Error("Upload did not return blobId.");
        }

        setStatus({ type: "info", message: "Creating element in the scene..." });
        const result = await integrate.createElementV2({
          representations: {
            volumeMesh: {
              type: "linked",
              blobId: upload.blobId,
            },
          },
        });
        geometryUrn = result.urn;

        // Cache the upload
        cachedUpload.current = {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          geometryUrn,
        };
      }

      const { path } = await Forma.proposal.addElement({
        urn: geometryUrn,
        transform,
      });
      setElementPath(path);

      await Forma.experimental.render.element.add({
        elements: [
          {
            urn: geometryUrn as `urn:adsk-forma-elements:${string}:${string}:${string}:${string}`,
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

  return (
    <>
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
    </>
  );
}
