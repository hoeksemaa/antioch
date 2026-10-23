// Builds one person GLB: an outfit (with its skeleton), the head from a base
// character, and optional hair, all bound to the outfit's skeleton.
// Usage: node build-person.mjs <outfit.gltf> <base.gltf> <hair.gltf|-> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, textureCompress, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

const [outfitPath, basePath, hairPath, outPath] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(outfitPath);
const root = doc.getRoot();
const outfitScene = root.listScenes()[0];
const outfitJoints = new Map(root.listSkins()[0].listJoints().map((j) => [j.getName(), j]));

// Keeps only the triangles of the base body whose vertices hang mostly on the
// head or neck. The outfit covers the rest.
function trimToHead(prim, joints) {
  const J = prim.getAttribute('JOINTS_0').getArray();
  const W = prim.getAttribute('WEIGHTS_0').getArray();
  const keep = (v) => {
    let best = 0;
    for (let k = 1; k < 4; k++) if (W[v * 4 + k] > W[v * 4 + best]) best = k;
    const name = joints[J[v * 4 + best]].getName();
    return name === 'Head' || name === 'neck_01';
  };
  const index = prim.getIndices();
  const src = index.getArray();
  const out = [];
  for (let t = 0; t < src.length; t += 3) {
    if (keep(src[t]) && keep(src[t + 1]) && keep(src[t + 2])) out.push(src[t], src[t + 1], src[t + 2]);
  }
  index.setArray(new Uint32Array(out));
  return [src.length / 3, out.length / 3];
}

async function addPart(path, isBase) {
  const part = await io.read(path);
  const before = new Set(root.listScenes());
  mergeDocuments(doc, part);
  const scene = root.listScenes().find((s) => !before.has(s));
  for (const node of [...scene.listChildren()]) {
    const meshNodes = [];
    node.traverse((n) => n.getMesh() && n.getSkin() && meshNodes.push(n));
    for (const n of meshNodes) {
      const skin = n.getSkin();
      const joints = skin.listJoints();
      for (const prim of n.getMesh().listPrimitives()) {
        const material = prim.getMaterial()?.getName() ?? '';
        if (isBase && /Superhero|Regular/.test(material)) console.log('  trim', material, trimToHead(prim, joints));
      }
      // Bind to the outfit's bones, by name, in the same order.
      const mapped = joints.map((j) => outfitJoints.get(j.getName()));
      if (mapped.some((j) => !j)) throw new Error('missing joint in ' + path);
      for (const j of joints) skin.removeJoint(j);
      for (const j of mapped) skin.addJoint(j);
      skin.setSkeleton(outfitJoints.get('root'));
      n.getParentNode()?.removeChild(n);
      outfitScene.addChild(n);
    }
  }
  scene.dispose();
}

await addPart(basePath, true);
if (hairPath !== '-') await addPart(hairPath, false);
for (const s of root.listScenes()) if (s !== outfitScene) s.dispose();
root.setDefaultScene(outfitScene);

await doc.transform(
  prune(),
  dedup(),
  unpartition(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
);
await io.write(outPath, doc);
const meshes = root.listMeshes().map((m) => m.getName());
console.log(outPath, 'meshes', meshes.join(','), 'materials', root.listMaterials().map((m) => m.getName()).join(','));
