// Keeps a few clips from the animation library, drops its mesh, and keeps
// rotation tracks plus root and pelvis translation (other bones keep the
// outfit's own bone lengths). Prints the root-motion speed of each clip.
// Usage: node build-anims.mjs <UAL.glb> <UAL_RM.glb> <out.glb> clip...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, unpartition, resample } from '@gltf-transform/functions';
const [src, rm, out, ...keep] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const rmDoc = await io.read(rm);
for (const a of rmDoc.getRoot().listAnimations()) {
  if (!keep.includes(a.getName())) continue;
  for (const c of a.listChannels()) {
    if (c.getTargetPath() !== 'translation' || c.getTargetNode().getName() !== 'root') continue;
    const s = c.getSampler(); const t = s.getInput().getArray(); const v = s.getOutput().getArray();
    const n = t.length - 1;
    const d = Math.hypot(v[n * 3] - v[0], v[n * 3 + 2] - v[2], v[n*3+1]-v[1]);
    console.log(a.getName(), 'duration', t[n].toFixed(3), 's, root moves', d.toFixed(3), 'speed', (d / t[n]).toFixed(3), 'axis', [v[n*3]-v[0], v[n*3+1]-v[1], v[n*3+2]-v[2]].map(x=>x.toFixed(2)).join(','));
  }
}

const doc = await io.read(src);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  if (!keep.includes(a.getName())) {
    for (const c of a.listChannels()) c.dispose();
    for (const sm of a.listSamplers()) sm.dispose();
    a.dispose();
    continue;
  }
  for (const c of a.listChannels()) {
    const path = c.getTargetPath();
    const name = c.getTargetNode().getName();
    if (path === 'scale' || (path === 'translation' && name !== 'root' && name !== 'pelvis')) {
      c.getSampler().dispose(); c.dispose();
    }
  }
}
for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
for (const s of root.listSkins()) s.dispose();
await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), unpartition());
await io.write(out, doc);
console.log(out, root.listAnimations().map((a) => a.getName()).join(','));
