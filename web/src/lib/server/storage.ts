// Armazenamento de arquivos e JSON.
//
// - Na Vercel: Vercel Blob privado. O navegador e a Sandbox nunca recebem o token;
//   eles usam URLs assinadas que valem por pouco tempo e só para um arquivo.
// - Em desenvolvimento (sem BLOB_READ_WRITE_TOKEN): pasta local web/.data.

import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { del, get, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

export type StorageKind = "blob" | "local";

export interface Storage {
  kind: StorageKind;
  readJSON<T>(path: string, fresh?: boolean): Promise<T | null>;
  writeJSON(path: string, data: unknown): Promise<void>;
  list(prefix: string): Promise<string[]>;
  /** Endereço para o worker baixar o arquivo (URL assinada ou caminho local). */
  downloadTarget(path: string): Promise<string>;
  /** Endereço para o worker enviar um arquivo (URL assinada ou caminho local). */
  uploadTarget(path: string): Promise<string>;
  /** Entrega o arquivo para o navegador. */
  serve(path: string): Promise<Response>;
  deletePrefix(prefix: string): Promise<void>;
  /** Grava um upload recebido pela API (só no modo local; na Vercel o navegador envia direto ao Blob). */
  saveUpload(path: string, file: File): Promise<void>;
}

const SIGNED_TTL = 60 * 60 * 1000;
const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  json: "application/json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

function contentType(path: string) {
  return CONTENT_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

class BlobStorage implements Storage {
  kind = "blob" as const;

  async readJSON<T>(path: string, fresh = false): Promise<T | null> {
    const result = await get(path, { access: "private", useCache: !fresh }).catch(() => null);
    if (!result || result.statusCode !== 200) return null;
    return (await new Response(result.stream).json()) as T;
  }

  async writeJSON(path: string, data: unknown) {
    await put(path, JSON.stringify(data), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }

  async list(prefix: string) {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      paths.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return paths;
  }

  private async sign(path: string, operation: "get" | "put", useCache = true) {
    const validUntil = Date.now() + SIGNED_TTL;
    const token = await issueSignedToken({ pathname: path, operations: [operation], validUntil });
    const { presignedUrl } =
      operation === "get"
        ? await presignUrl(token, { operation, pathname: path, access: "private", validUntil, useCache })
        : await presignUrl(token, {
            operation,
            pathname: path,
            access: "private",
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: true,
          });
    return presignedUrl;
  }

  downloadTarget(path: string) {
    return this.sign(path, "get", false);
  }

  uploadTarget(path: string) {
    return this.sign(path, "put");
  }

  async serve(path: string) {
    return Response.redirect(await this.sign(path, "get"), 302);
  }

  async deletePrefix(prefix: string) {
    const paths = await this.list(prefix);
    if (paths.length) await del(paths);
  }

  async saveUpload(): Promise<void> {
    throw new Error("na Vercel o upload vai direto do navegador para o Blob");
  }
}

class LocalStorage implements Storage {
  kind = "local" as const;
  root = resolve(process.env.ELOTAKE_DATA ?? join(process.cwd(), ".data"));

  private file(path: string) {
    const full = resolve(this.root, path);
    if (!full.startsWith(this.root + sep)) throw new Error("caminho inválido");
    return full;
  }

  async readJSON<T>(path: string) {
    try {
      return JSON.parse(await readFile(this.file(path), "utf8")) as T;
    } catch {
      return null;
    }
  }

  async writeJSON(path: string, data: unknown) {
    const full = this.file(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, JSON.stringify(data, null, 2));
  }

  async list(prefix: string) {
    const base = this.file(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
    const entries = await readdir(base, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name).slice(this.root.length + 1).split(sep).join("/"));
  }

  async downloadTarget(path: string) {
    return this.file(path);
  }

  async uploadTarget(path: string) {
    return this.file(path);
  }

  async serve(path: string) {
    const full = this.file(path);
    const info = await stat(full).catch(() => null);
    if (!info) return new Response("Não encontrado", { status: 404 });
    const body = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new Response(body, {
      headers: { "Content-Type": contentType(path), "Content-Length": String(info.size) },
    });
  }

  async deletePrefix(prefix: string) {
    await rm(this.file(prefix), { recursive: true, force: true });
  }

  async saveUpload(path: string, file: File) {
    const full = this.file(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(await file.arrayBuffer()));
  }
}

let instance: Storage | null = null;

export function storage(): Storage {
  instance ??= process.env.BLOB_READ_WRITE_TOKEN ? new BlobStorage() : new LocalStorage();
  return instance;
}
