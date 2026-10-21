import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

// Object storage behind one tiny interface: local disk for development, any S3-compatible
// bucket (AWS S3, Cloudflare R2, Supabase Storage) in production. Keys are always
// "<hotelId>/<mediaId>/<file>" and are validated before use.

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(prefix: string): Promise<void>;
}

const KEY_RE = /^[a-zA-Z0-9-]{8,64}\/[a-zA-Z0-9-]{8,64}(\/[a-z0-9.]{1,32})?$/;

function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error(`Invalid storage key: ${key}`);
}

class LocalStorage implements ObjectStorage {
  private root = path.join(process.cwd(), ".data", "uploads");

  async put(key: string, data: Buffer) {
    assertKey(key);
    const file = path.join(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    assertKey(key);
    try {
      return await readFile(path.join(this.root, key));
    } catch {
      return null;
    }
  }

  async remove(prefix: string) {
    assertKey(prefix);
    await rm(path.join(this.root, prefix), { recursive: true, force: true });
  }
}

class S3Storage implements ObjectStorage {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  })();
  private bucket = process.env.S3_BUCKET ?? "";

  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async get(key: string) {
    assertKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async remove(prefix: string) {
    assertKey(prefix);
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const listed = await client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${prefix}/` }));
    const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objects.length) await client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
  }
}

let instance: ObjectStorage | null = null;

export function storage(): ObjectStorage {
  if (!instance) instance = config.storageDriver === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}
