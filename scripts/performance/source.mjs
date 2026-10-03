import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

export const archiveSource = async directory => {
    const folders = ["apps/client-ts/src/render/three", "apps/client-ts/src/performance", "scripts/performance"];
    const listings = await Promise.all(folders.map(async folder => (await readdir(folder)).filter(file => /\.(ts|mjs|py)$/.test(file)).map(file => `${folder}/${file}`)));
    const paths = [...listings.flat(), "apps/client-ts/src/three-demo.ts", "package-lock.json"];
    const files = await Promise.all(paths.map(async path => {
        const source = await readFile(path, "utf8");
        return { path, sha256: createHash("sha256").update(source).digest("hex"), source };
    }));
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    await writeFile(`${directory}/source.json.gz`, gzipSync(JSON.stringify({ revision, files })));
    await writeFile(`${directory}/source-manifest.json`, JSON.stringify({ revision, files: files.map(({ path, sha256 }) => ({ path, sha256 })) }, null, 2));
};
