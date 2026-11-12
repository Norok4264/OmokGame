import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileManifest} from "./source-files.mjs";
import assert from "node:assert/strict";
const root=resolve(process.argv[2]??"."),manifest=JSON.parse(await readFile(resolve(root,"SOURCE_MANIFEST.json"),"utf8"));
const actual=await fileManifest(root,manifest.entries.map(e=>e.path));assert.deepEqual(actual.entries,manifest.entries);assert.equal(actual.treeSha256,manifest.treeSha256);
console.log(JSON.stringify({verified:true,files:actual.entries.length,codeSha256:actual.codeSha256,personalAcademicReportIncluded:manifest.personalAcademicReportIncluded}));
