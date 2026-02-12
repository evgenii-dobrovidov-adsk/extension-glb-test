import { useState } from "preact/hooks";
import { Forma } from "forma-embedded-view-sdk/auto";
import type { Status, TransformMatrix } from "./types";
import { isGlbFile } from "./types";
import { glbToGeometryData } from "./glb-utils";

type Props = {
  selectedFile: File | null;
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
  setStatus: (status: Status | null) => void;
};

export function RenderAsMesh({ selectedFile, isBusy, setIsBusy, setStatus }: Props) {
  const [meshId, setMeshId] = useState<string | null>(null);

  const handleRenderMesh = async () => {
    if (!selectedFile) {
      setStatus({ type: "error", message: "Select a .glb file first." });
      return;
    }

    if (!isGlbFile(selectedFile)) {
      setStatus({ type: "error", message: "Selected file must be a .glb." });
      return;
    }

    setIsBusy(true);
    setStatus({ type: "info", message: "Click in the scene to place the mesh..." });

    try {
      const point = await Forma.designTool.getPoint();
      if (!point) {
        setStatus({ type: "info", message: "Placement cancelled." });
        return;
      }

      const { x, y } = point;
      const z = await Forma.terrain.getElevationAt({ x, y });

      setStatus({ type: "info", message: "Converting GLB to mesh data..." });
      const arrayBuffer = await selectedFile.arrayBuffer();
      const geometryData = await glbToGeometryData(arrayBuffer);

      // Create transform matrix with +90 degree rotation around X axis (Y-up to Z-up) and 0.1 scale
      const s = 0.1;
      const transform: TransformMatrix = [
        s, 0, 0, 0,
        0, 0, s, 0,
        0, -s, 0, 0,
        x, y, z, 1,
      ];

      setStatus({ type: "info", message: "Rendering mesh..." });
      const { id } = await Forma.render.addMesh({ geometryData, transform });
      setMeshId(id);

      setStatus({
        type: "success",
        message: `Mesh rendered at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error during mesh render.";
      setStatus({ type: "error", message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCleanupMesh = async () => {
    setIsBusy(true);
    setStatus({ type: "info", message: "Cleaning up all meshes..." });

    try {
      await Forma.render.cleanup();
      setStatus({ type: "success", message: "All meshes removed." });
      setMeshId(null);
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
    <>
      <h2>Render as Mesh</h2>
      <p class="subtitle">
        Converts GLB to GeometryData and uses RenderApi.addMesh.
      </p>
      <div class="panel">
        <div class="button-row">
          <button
            class="primary"
            onClick={handleRenderMesh}
            disabled={isBusy || !selectedFile}
          >
            {isBusy ? "Working..." : "Pick point & add mesh"}
          </button>
          <button
            class="secondary"
            onClick={handleCleanupMesh}
            disabled={isBusy}
          >
            Cleanup all
          </button>
        </div>
        {meshId && (
          <div class="path-row">
            <span class="path-label">Mesh ID</span>
            <code class="path-value">{meshId}</code>
          </div>
        )}
      </div>
    </>
  );
}
