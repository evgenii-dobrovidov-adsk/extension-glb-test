import { useState } from "preact/hooks";
import { Forma } from "forma-embedded-view-sdk/auto";
import type { Status } from "./types";
import { isGlbFile } from "./types";
import { transformGlb } from "./glb-utils";

type Props = {
  selectedFile: File | null;
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
  setStatus: (status: Status | null) => void;
};

export function RenderGlbTemporarily({ selectedFile, isBusy, setIsBusy, setStatus }: Props) {
  const [renderGlbId, setRenderGlbId] = useState<string | null>(null);

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
    <>
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
    </>
  );
}
