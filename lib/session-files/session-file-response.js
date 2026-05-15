import { createSessionFileResourceEnvelope } from "../resources/resource-envelope.js";

export function serializeSessionFile(file, options = {}) {
  if (!file) return null;
  const id = file.id || file.fileId || null;
  const spaceId = resolveSpaceId(options);
  const resource = spaceId
    ? createSessionFileResourceEnvelope({ ...file, ...(id ? { id } : {}) }, { spaceId })
    : null;
  return {
    ...(id ? { id, fileId: id } : {}),
    ...(file.sessionPath ? { sessionPath: file.sessionPath } : {}),
    filePath: file.filePath,
    ...(file.realPath ? { realPath: file.realPath } : {}),
    ...(file.displayName ? { displayName: file.displayName } : {}),
    ...(file.filename ? { filename: file.filename } : {}),
    ...(file.label ? { label: file.label } : {}),
    ...(file.ext !== undefined ? { ext: file.ext } : {}),
    ...(file.mime ? { mime: file.mime } : {}),
    ...(file.size !== undefined ? { size: file.size } : {}),
    ...(file.kind ? { kind: file.kind } : {}),
    ...(file.isDirectory !== undefined ? { isDirectory: file.isDirectory } : {}),
    ...(file.origin ? { origin: file.origin } : {}),
    ...(Array.isArray(file.operations) ? { operations: file.operations } : {}),
    ...(file.createdAt !== undefined ? { createdAt: file.createdAt } : {}),
    ...(file.storageKind ? { storageKind: file.storageKind } : {}),
    ...(file.status ? { status: file.status } : {}),
    ...(file.missingAt !== undefined ? { missingAt: file.missingAt } : {}),
    ...(resource ? { resource } : {}),
  };
}

export function registerSessionFileFromRequest(engine, { sessionPath, filePath, label, origin, storageKind }) {
  if (!sessionPath) return null;
  if (typeof engine?.registerSessionFile !== "function") {
    throw new Error("session file registry unavailable");
  }
  return serializeSessionFile(engine.registerSessionFile({
    sessionPath,
    filePath,
    label,
    origin,
    storageKind,
  }), { runtimeContext: safeRuntimeContext(engine) });
}

function resolveSpaceId(options = {}) {
  if (typeof options.spaceId === "string" && options.spaceId.trim()) return options.spaceId;
  if (typeof options.runtimeContext?.spaceId === "string" && options.runtimeContext.spaceId.trim()) {
    return options.runtimeContext.spaceId;
  }
  return null;
}

function safeRuntimeContext(engine) {
  try {
    if (typeof engine?.getRuntimeContext === "function") return engine.getRuntimeContext();
  } catch {}
  return engine?.runtimeContext || null;
}
