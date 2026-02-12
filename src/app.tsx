import { useState } from "preact/hooks";
import type { Status } from "./types";
import { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, formatSize, isGlbFile } from "./types";
import { AddElementToProposal } from "./AddElementToProposal";
import { RenderGlbTemporarily } from "./RenderGlbTemporarily";
import { RenderAsMesh } from "./RenderAsMesh";
import "./app.css";

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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

      <AddElementToProposal
        selectedFile={selectedFile}
        isBusy={isBusy}
        setIsBusy={setIsBusy}
        setStatus={setStatus}
      />

      <RenderGlbTemporarily
        selectedFile={selectedFile}
        isBusy={isBusy}
        setIsBusy={setIsBusy}
        setStatus={setStatus}
      />

      <RenderAsMesh
        selectedFile={selectedFile}
        isBusy={isBusy}
        setIsBusy={setIsBusy}
        setStatus={setStatus}
      />
    </div>
  );
}
